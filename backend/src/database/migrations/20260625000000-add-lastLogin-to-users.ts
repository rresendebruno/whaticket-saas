import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Users", "lastLogin", {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "lastLogin");
  }
};
