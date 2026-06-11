import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Chatbot from "./Chatbot";
import Queue from "./Queue";

@Table
class ChatbotOption extends Model<ChatbotOption> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Chatbot)
  @Column
  chatbotId: number;

  @BelongsTo(() => Chatbot)
  chatbot: Chatbot;

  @AllowNull(false)
  @Column
  option: string;

  @AllowNull(false)
  @Column
  title: string;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ChatbotOption;
