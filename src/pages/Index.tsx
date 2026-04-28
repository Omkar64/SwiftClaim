import { Link } from "react-router-dom";
import { ArrowRight, Bot, ShieldCheck, Zap, Building2, Truck, Receipt, FileCheck, Wrench, CreditCard, TrendingUp, Clock, CheckCircle2, UploadCloud, FilePlus2, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CLAIM_STATES, STATE_LABELS } from "@/lib/claimStateMachine";
import heroBanner from "@/assets/hero-banner.jpg";

const features = [
  { icon: Bot, title: "AI-Powered Intake", desc: "Intelligent data extraction and image validation" },
  { icon: ShieldCheck, title: "Instant Verification", desc: "Real-time policy eligibility checks" },
  { icon: Zap, title: "Smart Assessment", desc: "AI damage analysis and part identification" },
  { icon: Building2, title: "Garage Network", desc: "Automated nearby service center assignment" },
  { icon: Truck, title: "Parts Logistics", desc: "End-to-end spare parts tracking" },
  { icon: Wrench, title: "Repair Tracking", desc: "Real-time repair progress monitoring" },
  { icon: Receipt, title: "Auto Billing", desc: "Dual invoice generation (insurance + customer)" },
  { icon: CreditCard, title: "Payment & Gate Pass", desc: "Payment-gated vehicle release system" },
];

const testimonials = [
  {
    name: "Priya Sharma",
    role: "Policyholder, Mumbai",
    text: "My claim was processed in under 2 hours! The AI agents automatically handled everything from damage assessment to gate pass. Zero paperwork.",
    rating: 5,
  },
  {
    name: "Rajan Mehta",
    role: "Fleet Manager, Bangalore",
    text: "Managing 15 commercial vehicles, the automated pipeline saves our team days every month. Real-time tracking means our drivers are never left waiting.",
    rating: 5,
  },
  {
    name: "Anita Desai",
    role: "Insurance Agent, Pune",
    text: "The fraud detection feature alone has saved our clients thousands. The AI cross-checks photos with descriptions — something humans often miss.",
    rating: 5,
  },
];

// Static marketing stats — shown to all visitors regardless of auth state
const STATIC_STATS = [
  { icon: TrendingUp, label: "Total Claims Processed", value: "500+", raw: null },
  { icon: CheckCircle2, label: "Claims Closed", value: "480+", raw: null },
  { icon: Clock, label: "Avg. Processing Time", value: "< 2 hrs", raw: null },
];

export default function Index() {

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden py-20 lg:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/3" />
        <div className="container relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-slide-up">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-6">
                <Bot className="h-4 w-4" /> 13-State AI Pipeline
              </div>
              <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                <span className="text-gradient">SwiftClaim</span> — AI Motor Insurance{" "}
                Claim Automation
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-lg">
                End-to-end cashless insurance claims powered by specialized AI agents.
                Strict 13-state machine from registration to gate pass — fully validated.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="shadow-hero">
                  <Link to="/raise-claim">
                    Raise a Claim <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/my-claims">Track Claims</Link>
                </Button>
              </div>
            </div>
            <div className="animate-fade-in hidden lg:block">
              <img src={heroBanner} alt="AI Motor Insurance Automation" className="rounded-2xl shadow-elevated" />
            </div>
          </div>
        </div>
      </section>

      {/* Live Stats Counter */}
      <section className="py-12 bg-primary">
        <div className="container">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            {STATIC_STATS.map((s, i) => (
              <div key={s.label} className="animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="flex justify-center mb-2">
                  <s.icon className="h-6 w-6 text-primary-foreground/70" />
                </div>
                <p className="text-4xl font-extrabold text-primary-foreground">
                  {s.value}
                </p>
                <p className="text-sm text-primary-foreground/75 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-card">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-foreground">How It Works</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              10 specialized AI agents enforce a strict 13-state pipeline for every claim
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="group rounded-xl border border-border bg-background p-6 shadow-card hover:shadow-elevated transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* State Machine Visualization */}
      <section className="py-20">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-foreground">13-State Claim Pipeline</h2>
            <p className="mt-3 text-muted-foreground">Every claim progresses through validated states — no skipping allowed</p>
          </div>
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              {CLAIM_STATES.map((state, i) => (
                <div key={state} className="flex gap-4 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      {i + 1}
                    </div>
                    {i < CLAIM_STATES.length - 1 && <div className="w-0.5 flex-1 min-h-[1.5rem] bg-primary/20" />}
                  </div>
                  <div className="pb-6 pt-2">
                    <h4 className="text-sm font-semibold text-foreground">{STATE_LABELS[state]}</h4>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* How It Works */}
      <section className="py-20 bg-card">
        <div className="container">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-foreground">How It Works</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Get your claim processed in three simple steps — no paperwork, no waiting
            </p>
          </div>
          <div className="relative max-w-4xl mx-auto">
            {/* Connector line */}
            <div className="hidden md:block absolute top-12 left-[calc(16.67%+1.25rem)] right-[calc(16.67%+1.25rem)] h-0.5 bg-primary/20" />
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: "01",
                  icon: UploadCloud,
                  title: "Upload Your Policy",
                  desc: "Securely upload your motor insurance document. Our AI instantly verifies coverage eligibility and vehicle details.",
                  link: "/my-policies",
                  cta: "Upload Now",
                },
                {
                  step: "02",
                  icon: FilePlus2,
                  title: "Raise a Claim",
                  desc: "Describe the incident, attach damage photos, and submit. Specialized AI agents handle assessment, garage assignment, and parts sourcing.",
                  link: "/raise-claim",
                  cta: "Raise Claim",
                },
                {
                  step: "03",
                  icon: RadioTower,
                  title: "Track in Real Time",
                  desc: "Follow your claim through every state — from intake to gate pass — on a live timeline. Share a QR code with your garage for instant updates.",
                  link: "/my-claims",
                  cta: "View Claims",
                },
              ].map((item, i) => (
                <div key={item.step} className="flex flex-col items-center text-center animate-slide-up" style={{ animationDelay: `${i * 120}ms` }}>
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 border-2 border-primary/20 mb-5">
                    <item.icon className="h-9 w-9 text-primary" />
                    <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shadow">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{item.desc}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link to={item.link}>{item.cta} <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-primary">
        <div className="container text-center">
          <FileCheck className="h-10 w-10 text-primary-foreground/80 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-primary-foreground">Ready to Experience Automated Claims?</h2>
          <p className="mt-2 text-primary-foreground/80 max-w-md mx-auto">
            Submit a claim and watch AI agents process it through all 13 states in real time.
          </p>
          <div className="mt-6 flex gap-3 justify-center flex-wrap">
            <Button asChild size="lg" variant="secondary" className="mt-0">
              <Link to="/raise-claim">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 mt-0">
              <Link to="/track">Track a Claim</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
