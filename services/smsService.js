async function formatPhoneNumber(number) {
  if (number.startsWith('0')) {
    return '63' + number.slice(1);
  }
  return number;
}

module.exports = { formatPhoneNumber };
