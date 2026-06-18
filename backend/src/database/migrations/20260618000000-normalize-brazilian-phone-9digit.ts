import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // Add the missing 9th digit to Brazilian mobile numbers stored as 12 digits
    // Pattern: starts with 55, followed by 2-digit DDD, then 8 digits (total 12)
    // Fix: insert '9' after the DDD → 13 digits
    await queryInterface.sequelize.query(`
      UPDATE Contacts
      SET number = CONCAT(SUBSTRING(number, 1, 4), '9', SUBSTRING(number, 5))
      WHERE isGroup = 0
        AND number REGEXP '^55[1-9][0-9]{9}$'
    `);
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    // Remove the inserted 9 (revert 13-digit back to 12-digit)
    await queryInterface.sequelize.query(`
      UPDATE Contacts
      SET number = CONCAT(SUBSTRING(number, 1, 4), SUBSTRING(number, 6))
      WHERE isGroup = 0
        AND number REGEXP '^55[1-9]9[0-9]{8}$'
    `);
  }
};
