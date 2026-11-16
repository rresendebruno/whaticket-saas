import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable(
      "MessageReactions",
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        // Plain indexed column (no FK): a FK to Messages.id requires identical
        // charset/collation on both columns and would abort the deploy if they differ.
        messageId: {
          type: DataTypes.STRING,
          allowNull: false
        },
        emoji: {
          type: DataTypes.STRING(32),
          allowNull: false
        },
        fromMe: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        // Who reacted: "me" for our WhatsApp number, otherwise the contact's
        // phone/LID. WhatsApp allows one reaction per person per message.
        senderNumber: {
          type: DataTypes.STRING,
          allowNull: false
        },
        senderName: {
          type: DataTypes.STRING,
          allowNull: true
        },
        // Agent who reacted (only for fromMe reactions sent from the system)
        userId: {
          type: DataTypes.INTEGER,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
          allowNull: true
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false
        }
      }
      // Inherits the DB default charset (utf8mb4, set in docker-compose), which
      // already stores emojis in message bodies.
    );

    await queryInterface.addIndex("MessageReactions", ["messageId", "senderNumber"], {
      unique: true,
      name: "message_reactions_message_sender_unique"
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("MessageReactions");
  }
};
