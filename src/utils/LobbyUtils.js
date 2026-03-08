/**
 * Generates a random 6-character alphanumeric lobby code.
 * @returns {string} 6-character alphanumeric string.
 */
export function generateLobbyCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Validates whether a given string is a valid 6-character alphanumeric lobby code.
 * @param {string} code The code to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
export function isValidLobbyCode(code) {
  if (typeof code !== 'string') return false;
  const alphanumericRegex = /^[a-zA-Z0-9]{6}$/;
  return alphanumericRegex.test(code);
}
