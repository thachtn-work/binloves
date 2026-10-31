import { PartialType } from '@nestjs/mapped-types';
import { CreateContactChannelDto } from './create-contact-channel.dto';

export class UpdateContactChannelDto extends PartialType(CreateContactChannelDto) {}
