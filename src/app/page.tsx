import { db } from "@/lib/db";
import { useRouter } from "next/router";


export default async function Home() {

  await db.set("hello", "hello")
  return (
    <main>
      hello
    </main>
  );
}
