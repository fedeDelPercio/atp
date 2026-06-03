import { FeedbackList } from "@/components/FeedbackList";

export const dynamic = "force-dynamic";

export default function FeedbackPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <FeedbackList />
    </div>
  );
}
