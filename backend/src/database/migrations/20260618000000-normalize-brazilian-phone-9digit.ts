import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // Find all 12-digit Brazilian contacts (55 + 2-digit DDD + 8-digit number)
    const [contacts] = (await queryInterface.sequelize.query(`
      SELECT id, number FROM Contacts
      WHERE isGroup = 0
        AND number REGEXP '^55[0-9]{10}$'
        AND LENGTH(number) = 12
    `)) as any;

    for (const contact of contacts as Array<{ id: number; number: string }>) {
      const normalized =
        contact.number.slice(0, 4) + "9" + contact.number.slice(4);

      // Check if a contact with the 13-digit number already exists
      const [existing] = (await queryInterface.sequelize.query(
        `SELECT id FROM Contacts WHERE number = '${normalized}' LIMIT 1`
      )) as any;

      if ((existing as any[]).length > 0) {
        // Conflict: 13-digit version already exists — merge into it
        const primaryId = (existing as any[])[0].id;

        // Move tickets from 12-digit contact to 13-digit contact
        await queryInterface.sequelize.query(
          `UPDATE Tickets SET contactId = ${primaryId} WHERE contactId = ${contact.id}`
        );

        // Delete custom fields of the 12-digit contact
        await queryInterface.sequelize.query(
          `DELETE FROM ContactCustomFields WHERE contactId = ${contact.id}`
        );

        // Delete the 12-digit contact
        await queryInterface.sequelize.query(
          `DELETE FROM Contacts WHERE id = ${contact.id}`
        );
      } else {
        // No conflict — just update the number
        await queryInterface.sequelize.query(
          `UPDATE Contacts SET number = '${normalized}' WHERE id = ${contact.id}`
        );
      }
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    // Remove the inserted 9 from contacts that were normalized (best-effort)
    await queryInterface.sequelize.query(`
      UPDATE Contacts
      SET number = CONCAT(SUBSTRING(number, 1, 4), SUBSTRING(number, 6))
      WHERE isGroup = 0
        AND LENGTH(number) = 13
        AND number REGEXP '^55[0-9]{2}9[0-9]{8}$'
    `);
  }
};
