export const RESUME_UPLOAD_CONTRACT = {
  endpoint: '/api/resumes/upload',
  method: 'POST',
  field: 'files',
  formats: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ],
} as const;

export const RESUME_UPLOAD_ACCEPT = [
  '.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
].join(',');
