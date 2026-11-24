import { MascotStage } from "@/components/mascot-stage";

export const metadata = { title: "Meet the Yeti · Yeti Arena", description: "The Yeti Arena mascot in its frozen mountain home." };

export default function MascotPage() {
  return <div className="px-3 pt-4 sm:px-6 sm:pt-8"><MascotStage /></div>;
}
