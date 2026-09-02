[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$requiredEnvironment = @(
    'SMOKE_API_URL',
    'SMOKE_ADMIN_EMAIL',
    'SMOKE_ADMIN_PASSWORD',
    'SMOKE_STUDENT_EMAIL',
    'SMOKE_STUDENT_PASSWORD'
)

$missingEnvironment = @(
    $requiredEnvironment | Where-Object {
        [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_))
    }
)

if ($missingEnvironment.Count -gt 0) {
    Write-Host "Missing required environment variables: $($missingEnvironment -join ', ')" -ForegroundColor Red
    exit 2
}

$script:ApiBase = $env:SMOKE_API_URL.TrimEnd('/')
$script:Results = New-Object 'System.Collections.Generic.List[object]'
$script:RunId = Get-Date -Format 'yyyyMMdd-HHmmss'

$artifactDirectory = if ([string]::IsNullOrWhiteSpace($env:SMOKE_ARTIFACT_DIR)) {
    Join-Path ([IO.Path]::GetTempPath()) "course-management-smoke\$script:RunId"
} else {
    $env:SMOKE_ARTIFACT_DIR
}

New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null

function Add-SmokeResult {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet('PASS', 'FAIL', 'SKIP')][string]$Status,
        [Parameter(Mandatory = $true)][int]$DurationMs,
        [string]$ErrorMessage
    )

    $script:Results.Add([pscustomobject]@{
        id         = $Id
        name       = $Name
        status     = $Status
        durationMs = $DurationMs
        error      = $ErrorMessage
    })
}

function Invoke-SmokeStep {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    $startedAt = Get-Date

    try {
        $value = & $Action
        $durationMs = [int]((Get-Date) - $startedAt).TotalMilliseconds
        Add-SmokeResult -Id $Id -Name $Name -Status 'PASS' -DurationMs $durationMs
        Write-Host "PASS $Id - $Name (${durationMs}ms)" -ForegroundColor Green
        return $value
    } catch {
        $durationMs = [int]((Get-Date) - $startedAt).TotalMilliseconds
        $message = $_.Exception.Message
        Add-SmokeResult -Id $Id -Name $Name -Status 'FAIL' -DurationMs $durationMs -ErrorMessage $message
        Write-Host "FAIL $Id - ${Name}: $message" -ForegroundColor Red
        throw
    }
}

function Invoke-ApiJson {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('Get', 'Post')][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [hashtable]$Headers,
        [string]$Body
    )

    $request = @{
        Uri         = "$script:ApiBase$Path"
        Method      = $Method
        ErrorAction = 'Stop'
    }

    if ($null -ne $Headers) {
        $request.Headers = $Headers
    }

    if (-not [string]::IsNullOrEmpty($Body)) {
        $request.ContentType = 'application/json'
        $request.Body = $Body
    }

    Invoke-RestMethod @request
}

function Invoke-ExpectedStatus {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$ExpectedStatus,
        [hashtable]$Headers
    )

    $request = @{
        Uri         = "$script:ApiBase$Path"
        Method      = 'Get'
        ErrorAction = 'Stop'
        UseBasicParsing = $true
    }

    if ($null -ne $Headers) {
        $request.Headers = $Headers
    }

    $actualStatus = $null

    try {
        $response = Invoke-WebRequest @request
        $actualStatus = [int]$response.StatusCode
    } catch {
        if ($null -eq $_.Exception.Response) {
            throw
        }

        $actualStatus = [int]$_.Exception.Response.StatusCode
    }

    if ($actualStatus -ne $ExpectedStatus) {
        throw "Expected HTTP $ExpectedStatus from $Path but received HTTP $actualStatus"
    }
}

function Assert-NotNull {
    param(
        [Parameter(Mandatory = $true)]$Value,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if ($null -eq $Value) {
        throw "$Description returned an empty response"
    }
}

function Assert-SafeUser {
    param(
        [Parameter(Mandatory = $true)]$User,
        [Parameter(Mandatory = $true)][string]$ExpectedRole,
        [Parameter(Mandatory = $true)][string]$Description
    )

    Assert-NotNull -Value $User -Description $Description

    if ($User.role -ne $ExpectedRole) {
        throw "$Description returned role '$($User.role)', expected '$ExpectedRole'"
    }

    if (@($User.PSObject.Properties.Name) -contains 'passwordHash') {
        throw "$Description exposed passwordHash"
    }
}

function Get-LoginSession {
    param(
        [Parameter(Mandatory = $true)][string]$Email,
        [Parameter(Mandatory = $true)][string]$Password,
        [Parameter(Mandatory = $true)][string]$ExpectedRole
    )

    $body = @{
        email    = $Email
        password = $Password
    } | ConvertTo-Json -Compress

    $login = Invoke-ApiJson -Method Post -Path '/auth/login' -Body $body

    if ([string]::IsNullOrWhiteSpace($login.accessToken)) {
        throw 'Login response did not contain accessToken'
    }

    Assert-SafeUser -User $login.user -ExpectedRole $ExpectedRole -Description 'Login user'

    [pscustomobject]@{
        Token = $login.accessToken
        User  = $login.user
    }
}

function Save-SmokeReport {
    param(
        [Parameter(Mandatory = $true)][ValidateSet('PASS', 'FAIL')][string]$Status,
        [string]$Failure
    )

    $report = [pscustomobject]@{
        status        = $Status
        runId         = $script:RunId
        apiUrl        = $script:ApiBase
        executedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        failure       = $Failure
        results       = @($script:Results.ToArray())
    }

    $reportPath = Join-Path $artifactDirectory 'result.json'
    $report | ConvertTo-Json -Depth 10 | Set-Content -Path $reportPath -Encoding UTF8
    Write-Host "Smoke report: $reportPath"
}

try {
    Invoke-SmokeStep -Id 'SMK-001' -Name 'API health and database connection' -Action {
        $health = Invoke-ApiJson -Method Get -Path '/health'

        if ($health.status -ne 'ok' -or $health.database -ne 'connected') {
            throw "Unexpected health response: status=$($health.status), database=$($health.database)"
        }
    } | Out-Null

    if (-not [string]::IsNullOrWhiteSpace($env:SMOKE_VERSION_URL)) {
        Invoke-SmokeStep -Id 'SMK-002' -Name 'Deployed version metadata' -Action {
            $version = Invoke-RestMethod -Uri $env:SMOKE_VERSION_URL -Method Get -ErrorAction Stop

            if (-not [string]::IsNullOrWhiteSpace($env:SMOKE_EXPECTED_COMMIT) -and $version.commit -ne $env:SMOKE_EXPECTED_COMMIT) {
                throw "Expected commit '$($env:SMOKE_EXPECTED_COMMIT)' but received '$($version.commit)'"
            }

            if (-not [string]::IsNullOrWhiteSpace($env:SMOKE_EXPECTED_VERSION) -and $version.version -ne $env:SMOKE_EXPECTED_VERSION) {
                throw "Expected version '$($env:SMOKE_EXPECTED_VERSION)' but received '$($version.version)'"
            }
        } | Out-Null
    } else {
        Add-SmokeResult -Id 'SMK-002' -Name 'Deployed version metadata' -Status 'SKIP' -DurationMs 0 -ErrorMessage 'SMOKE_VERSION_URL is not configured'
        Write-Host 'SKIP SMK-002 - Deployed version metadata (SMOKE_VERSION_URL is not configured)' -ForegroundColor Yellow
    }

    $adminSession = Invoke-SmokeStep -Id 'SMK-003' -Name 'Admin login' -Action {
        Get-LoginSession -Email $env:SMOKE_ADMIN_EMAIL -Password $env:SMOKE_ADMIN_PASSWORD -ExpectedRole 'ADMIN'
    }

    $adminHeaders = @{ Authorization = "Bearer $($adminSession.Token)" }

    Invoke-SmokeStep -Id 'SMK-004' -Name 'Admin profile and safe response' -Action {
        $me = Invoke-ApiJson -Method Get -Path '/auth/me' -Headers $adminHeaders
        Assert-SafeUser -User $me -ExpectedRole 'ADMIN' -Description 'Admin profile'
    } | Out-Null

    $studentSession = Invoke-SmokeStep -Id 'SMK-005' -Name 'Student login' -Action {
        Get-LoginSession -Email $env:SMOKE_STUDENT_EMAIL -Password $env:SMOKE_STUDENT_PASSWORD -ExpectedRole 'STUDENT'
    }

    $studentHeaders = @{ Authorization = "Bearer $($studentSession.Token)" }

    Invoke-SmokeStep -Id 'SMK-006' -Name 'Student profile and safe response' -Action {
        $me = Invoke-ApiJson -Method Get -Path '/auth/me' -Headers $studentHeaders
        Assert-SafeUser -User $me -ExpectedRole 'STUDENT' -Description 'Student profile'
    } | Out-Null

    Invoke-SmokeStep -Id 'SEC-001' -Name 'Protected API rejects missing token' -Action {
        Invoke-ExpectedStatus -Path '/subjects' -ExpectedStatus 401
    } | Out-Null

    Invoke-SmokeStep -Id 'SEC-002' -Name 'Student cannot access Admin users API' -Action {
        Invoke-ExpectedStatus -Path '/users' -ExpectedStatus 403 -Headers $studentHeaders
    } | Out-Null

    $adminReadEndpoints = @(
        @{ Id = 'API-001'; Path = '/users'; Name = 'Admin reads users' },
        @{ Id = 'API-002'; Path = '/subjects'; Name = 'Admin reads subjects' },
        @{ Id = 'API-003'; Path = '/materials'; Name = 'Admin reads materials' },
        @{ Id = 'API-004'; Path = '/exams'; Name = 'Admin reads exams' },
        @{ Id = 'API-005'; Path = '/assignments'; Name = 'Admin reads assignments' },
        @{ Id = 'API-006'; Path = '/attempts'; Name = 'Admin reads attempts' }
    )

    foreach ($endpoint in $adminReadEndpoints) {
        $currentEndpoint = $endpoint
        Invoke-SmokeStep -Id $currentEndpoint.Id -Name $currentEndpoint.Name -Action {
            $response = Invoke-ApiJson -Method Get -Path $currentEndpoint.Path -Headers $adminHeaders
            Assert-NotNull -Value $response -Description $currentEndpoint.Path
        } | Out-Null
    }

    $studentReadEndpoints = @(
        @{ Id = 'API-007'; Path = '/subjects'; Name = 'Student reads subjects' },
        @{ Id = 'API-008'; Path = '/materials'; Name = 'Student reads accessible materials' },
        @{ Id = 'API-009'; Path = '/exams'; Name = 'Student reads accessible exams' },
        @{ Id = 'API-010'; Path = '/assignments'; Name = 'Student reads assignments' },
        @{ Id = 'API-011'; Path = '/attempts'; Name = 'Student reads own attempts' }
    )

    foreach ($endpoint in $studentReadEndpoints) {
        $currentEndpoint = $endpoint
        Invoke-SmokeStep -Id $currentEndpoint.Id -Name $currentEndpoint.Name -Action {
            $response = Invoke-ApiJson -Method Get -Path $currentEndpoint.Path -Headers $studentHeaders
            Assert-NotNull -Value $response -Description $currentEndpoint.Path
        } | Out-Null
    }

    Save-SmokeReport -Status 'PASS'
    Write-Host 'SMOKE TEST PASSED' -ForegroundColor Green
    exit 0
} catch {
    $failureMessage = $_.Exception.Message
    Save-SmokeReport -Status 'FAIL' -Failure $failureMessage
    Write-Host "SMOKE TEST FAILED: $failureMessage" -ForegroundColor Red
    exit 1
}
