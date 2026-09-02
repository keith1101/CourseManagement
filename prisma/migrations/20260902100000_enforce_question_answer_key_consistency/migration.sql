-- Multiple-choice questions use QuestionOption.isCorrect as their only answer key.
-- Repair legacy rows where the old text answer unambiguously matches one option
-- before removing the redundant text answer field.
WITH matched_answers AS (
    SELECT
        q."id" AS "questionId",
        MIN(option."id") AS "correctOptionId"
    FROM "Question" q
    JOIN "QuestionOption" option
        ON option."questionId" = q."id"
    WHERE q."questionType" = 'MULTIPLE_CHOICE'
      AND NULLIF(BTRIM(q."correctTextAnswer"), '') IS NOT NULL
      AND LOWER(BTRIM(option."contentText")) = LOWER(BTRIM(q."correctTextAnswer"))
    GROUP BY q."id"
    HAVING COUNT(*) = 1
)
UPDATE "QuestionOption" option
SET "isCorrect" = option."id" = matched."correctOptionId"
FROM matched_answers matched
WHERE option."questionId" = matched."questionId";

UPDATE "Question"
SET "correctTextAnswer" = NULL
WHERE "questionType" = 'MULTIPLE_CHOICE';

ALTER TABLE "Question"
ADD CONSTRAINT "Question_multiple_choice_no_text_answer"
CHECK (
    "questionType" <> 'MULTIPLE_CHOICE'
    OR "correctTextAnswer" IS NULL
);
