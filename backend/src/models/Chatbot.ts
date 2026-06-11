import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  HasMany
} from "sequelize-typescript";
import ChatbotOption from "./ChatbotOption";

@Table
class Chatbot extends Model<Chatbot> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Default(false)
  @Column
  enabled: boolean;

  @Column(DataType.TEXT)
  greetingMessage: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => ChatbotOption, { onDelete: "CASCADE" })
  options: ChatbotOption[];
}

export default Chatbot;
