const technicalErrorPatterns = [
  /Failed to fetch/i,
  /NetworkError/i,
  /^HTTP\s*\d{3}/i,
  /Request failed/i,
  /Unexpected token/i,
  /^TypeError:/i,
  /^SyntaxError:/i,
];

export function userFacingError(error: unknown, fallback: string) {
  const message = error instanceof Error
    ? error.message.trim()
    : typeof error === 'string'
      ? error.trim()
      : '';

  if (!message || technicalErrorPatterns.some((pattern) => pattern.test(message))) {
    return `${fallback}，请稍后重试。`;
  }

  return /[\u3400-\u9fff]/.test(message)
    ? message
    : `${fallback}，请稍后重试。`;
}
