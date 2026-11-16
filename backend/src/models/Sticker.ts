import {
  Table,
  Column,
  DataType,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import User from "./User";

@Table
class Sticker extends Model<Sticker> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  filename: string;

  @Column
  mimetype: string;

  @Column(DataType.STRING(64))
  hash: string;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Column(DataType.VIRTUAL)
  get url(): string {
    return `${process.env.BACKEND_URL}:${
      process.env.PROXY_PORT
    }/public/${this.getDataValue("filename")}`;
  }

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Sticker;
