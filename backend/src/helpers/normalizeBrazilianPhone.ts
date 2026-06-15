// Brazilian mobile numbers arrive from Z-API in two formats:
//   13 digits: 55 + DDD(2) + 9 + number(8) — new format (correct)
//   12 digits: 55 + DDD(2) + number(8)      — old format (missing the 9)
// Normalize to the 13-digit format so contacts don't duplicate and
// outgoing messages reach the correct WhatsApp number.
const normalizeBrazilianPhone = (phone: string): string => {
  if (phone.startsWith("55") && phone.length === 12) {
    return phone.slice(0, 4) + "9" + phone.slice(4);
  }
  return phone;
};

export default normalizeBrazilianPhone;
