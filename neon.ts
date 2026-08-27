import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  // Keep the existing Neon Auth configuration managed with this project.
  auth: true,
  preview: {
    buckets: {
      'course-media-bucket': {
        access: 'private',
      },
    },
  },
});
