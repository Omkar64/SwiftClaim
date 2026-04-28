import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClaimStateTimeline } from "@/components/ClaimStateTimeline";
import { ArrowRight } from "lucide-react";

export default function ClaimStatus() {
  return (
    <div className="container py-12 max-w-2xl">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl font-bold text-foreground">Claim State Machine</h1>
        <p className="mt-2 text-muted-foreground">
          Every claim progresses through 13 validated states. Below is the full pipeline.
        </p>
      </div>

      <Card className="shadow-card animate-slide-up" style={{ animationDelay: "80ms" }}>
        <CardContent className="py-8">
          <ClaimStateTimeline currentState="CLAIM_CLOSED" />
        </CardContent>
      </Card>

      <div className="mt-8 text-center animate-slide-up" style={{ animationDelay: "160ms" }}>
        <Button asChild>
          <Link to="/raise-claim">
            Submit a Claim <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
