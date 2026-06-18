import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import normalizeBrazilianPhone from "../../helpers/normalizeBrazilianPhone";

interface ExtraInfo {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  email?: string;
  profilePicUrl?: string;
  extraInfo?: ExtraInfo[];
}

const CreateContactService = async ({
  name,
  number: rawNumber,
  email = "",
  extraInfo = []
}: Request): Promise<Contact> => {
  const number = normalizeBrazilianPhone(rawNumber.replace(/\D/g, ""));

  const numberExists = await Contact.findOne({
    where: { number }
  });

  if (numberExists) {
    throw new AppError("ERR_DUPLICATED_CONTACT");
  }

  const contact = await Contact.create(
    {
      name,
      number,
      email,
      extraInfo
    },
    {
      include: ["extraInfo"]
    }
  );

  return contact;
};

export default CreateContactService;
