import { QueryInterface, DataTypes } from "sequelize";

// Idempotent: production already had a "mustChangePassword" column created
// outside these migrations, so only add it when missing.
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = (await queryInterface.describeTable("Users")) as Record<
      string,
      unknown
    >;
    if (!table.mustChangePassword) {
      await queryInterface.addColumn("Users", "mustChangePassword", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },
  down: async () => {
    // Intentionally left empty: the column may predate this migration.
  }
};
