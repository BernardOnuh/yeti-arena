import { Leaderboard } from "@/components/leaderboard";

export const metadata = { title: "Leaderboard · Yeti Arena" };

export default function LeaderboardPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 sm:pt-12">
      <h1 className="mb-6 font-display text-4xl font-bold">Leaderboard</h1>
      <Leaderboard />
    </div>
  );
}
