"use client"
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <main className="flex h-screen w-full justify-center items-center gap-5">
      <Loader2 className="animate-spin text-indigo-600" size={32}/>
      <p className="text-xl text-slate-600 animate-pulse">
        Redirecting to dashboard...
      </p> 
    </main>
  );
}
