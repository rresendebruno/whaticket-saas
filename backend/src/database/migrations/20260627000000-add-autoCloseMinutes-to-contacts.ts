import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Contacts", "autoCloseMinutes", {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Contacts", "autoCloseMinutes");
  }
};
