import LoginCardSection from "@/components/ui/login-signup";

type DemoOneProps = {
  onNavigate: (path: string) => void;
};

export default function DemoOne({ onNavigate }: DemoOneProps) {
  return <LoginCardSection onNavigate={onNavigate} />;
}
