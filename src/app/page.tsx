"use client"
import { Loader2 } from "lucide-react";
import { Suspense } from "react";


export default function Home() {
  return (
    <Suspense fallback={<Loader2 className="animate-spin text-green-600" size={30}/>}>
    <main className="flex !h-screen !w-full !justify-center !items-center gap-5">
      <Loader2 className="animate-spin text-green-600" size={30}/>
     <p className="text-2xl text-slate-500 animate-pulse">
      Redirecting to login page please wait...
      </p> 
    </main>
    </Suspense>
  );
}
