import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

/** Keep samples a bit over a year so the "năm" filter is always full. */
export const SAMPLE_RETENTION_DAYS = 400;

/** One host reading (percent used), taken every few minutes. */
@Schema({ collection: "system_samples", versionKey: false })
export class SystemSample {
  @Prop({ type: Date, required: true })
  at: Date;

  @Prop({ type: Number, required: true })
  cpu: number;

  @Prop({ type: Number, required: true })
  ram: number;

  @Prop({ type: Number })
  disk?: number;
}

export type SystemSampleDocument = HydratedDocument<SystemSample>;

export const SystemSampleSchema = SchemaFactory.createForClass(SystemSample);
SystemSampleSchema.index({ at: 1 }, { expireAfterSeconds: SAMPLE_RETENTION_DAYS * 24 * 3600 });
