import AppError from "../../errors/AppError";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { whatsappProvider } from "../../providers/WhatsApp";
import Contact from "../../models/Contact";
import { logger } from "../../utils/logger";

interface Result {
  total: number;
  created: number;
  updated: number;
}

// Imports every WhatsApp group of the instance as a group contact, so agents
// can open a conversation with any group (not only ones that messaged first).
const ImportGroupsService = async (userId: number): Promise<Result> => {
  if (!whatsappProvider.getGroups) {
    throw new AppError("ERR_IMPORT_GROUPS_NOT_SUPPORTED");
  }

  const defaultWhatsapp = await GetDefaultWhatsApp(userId);

  let groups;
  try {
    groups = await whatsappProvider.getGroups(defaultWhatsapp.id);
  } catch (err: any) {
    logger.error({
      msg: "Could not fetch WhatsApp groups",
      err: err?.response?.data || err?.message
    });
    throw new AppError("ERR_IMPORT_GROUPS");
  }

  let created = 0;
  let updated = 0;

  // Sequential on purpose: avoids hammering the DB with thousands of parallel queries
  // eslint-disable-next-line no-restricted-syntax
  for (const group of groups) {
    const { number } = group;
    const name = group.name || number;

    // eslint-disable-next-line no-await-in-loop
    const existing = await Contact.findOne({ where: { number } });

    if (!existing) {
      // eslint-disable-next-line no-await-in-loop
      await Contact.create({ number, name, isGroup: true });
      created += 1;
    } else if (existing.name !== name || !existing.isGroup) {
      // Keep group names in sync with WhatsApp
      // eslint-disable-next-line no-await-in-loop
      await existing.update({ name, isGroup: true });
      updated += 1;
    }
  }

  logger.info({ msg: "Groups imported", total: groups.length, created, updated });

  // Fetch group photos in the background (one at a time, small pause) so the
  // import answers fast and Z-API isn't flooded.
  const whatsappId = defaultWhatsapp.id;
  const numbers = groups.map(g => g.number);
  (async () => {
    let fetched = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const number of numbers) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const url = await whatsappProvider.getProfilePicUrl(whatsappId, number);
        if (url) {
          // eslint-disable-next-line no-await-in-loop
          await Contact.update({ profilePicUrl: url }, { where: { number } });
          fetched += 1;
        }
      } catch {
        // group without photo or not accessible — skip
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise(r => setTimeout(r, 300));
    }
    logger.info({ msg: "Group photos refreshed", total: numbers.length, fetched });
  })();

  return { total: groups.length, created, updated };
};

export default ImportGroupsService;
