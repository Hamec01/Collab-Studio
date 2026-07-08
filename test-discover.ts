import { z } from "zod";
console.log(z.string().optional().transform(v => v === "true" ? true : undefined).parse("true"));
