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
    '.zip',
  ],
} as const;

export const RESUME_UPLOAD_ACCEPT = [
  '.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.zip',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/zip', 'application/x-zip-compressed',
].join(',');
