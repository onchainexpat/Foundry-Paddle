import { useState, useMemo, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateChallenge } from "@/lib/interestWebhook";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COUNTRY_DIAL_CODES,
  E164_REGEX,
  composeE164,
  maxNationalDigits,
} from "@shared/countryDialCodes";

const STORAGE_KEY = "foundry_user";
const DEFAULT_COUNTRY_CODE = "US";

interface StoredUser {
  name: string;
  email: string;
  countryCode: string;
  nationalDigits: string;
}

function loadStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string") return parsed as StoredUser;
  } catch {
    /* ignore corrupt data */
  }
  return null;
}

function saveStoredUser(user: StoredUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

interface EventSignupFormProps {
  eventId: string;
  eventTitle: string;
  onSuccess?: () => void;
}

const fieldClassName =
  "w-full border border-border bg-secondary px-4 py-3 font-body text-sm tracking-widest text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none transition-colors";

const countrySelectTriggerClassName =
  "h-10 w-full border-border bg-secondary font-body text-xs tracking-[0.08em] text-foreground shadow-none rounded-none focus:ring-0 focus:ring-offset-0 focus:border-primary [&>span]:line-clamp-1";

const countrySelectContentClassName =
  "max-h-[min(240px,38vh)] min-w-[var(--radix-select-trigger-width)] max-w-[22rem] border-border bg-secondary text-foreground rounded-none shadow-lg z-[200]";

const countrySelectItemClassName =
  "rounded-none py-2 pl-8 pr-3 text-xs tracking-wide whitespace-normal leading-snug focus:bg-primary/15 focus:text-foreground data-[highlighted]:bg-primary/15";

export default function EventSignupForm({
  eventId,
  eventTitle,
  onSuccess,
}: EventSignupFormProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const stored = useMemo(() => loadStoredUser(), []);

  const [name, setName] = useState(stored?.name ?? "");
  const [email, setEmail] = useState(stored?.email ?? "");
  const [countryCode, setCountryCode] = useState(
    stored?.countryCode ?? DEFAULT_COUNTRY_CODE,
  );
  const [nationalDigits, setNationalDigits] = useState(
    stored?.nationalDigits ?? "",
  );
  const [honeypot, setHoneypot] = useState("");
  const [captcha, setCaptcha] = useState(generateChallenge);
  const [captchaInput, setCaptchaInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const dialDigits = useMemo(
    () => COUNTRY_DIAL_CODES.find((c) => c.code === countryCode)?.dial ?? "1",
    [countryCode],
  );
  const nationalMax = useMemo(
    () => maxNationalDigits(dialDigits),
    [dialDigits],
  );

  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateChallenge());
    setCaptchaInput("");
  }, []);

  const handleCountryChange = (code: string) => {
    setCountryCode(code);
    setNationalDigits("");
  };

  const handleNationalChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, nationalMax);
    setNationalDigits(digits);
  };

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => onSuccess?.(), 1500);
      return () => clearTimeout(timer);
    }
  }, [success, onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;

    if (!name.trim() || !email.trim()) {
      toast({
        title: "Please fill in your name and email",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({ title: "Please enter a valid email", variant: "destructive" });
      return;
    }

    let mobile: string | undefined;
    if (nationalDigits.trim()) {
      const composed = composeE164(dialDigits, nationalDigits);
      if (!E164_REGEX.test(composed)) {
        toast({
          title: "Please enter a valid mobile number",
          description: "Include your full number or leave the field blank.",
          variant: "destructive",
        });
        return;
      }
      mobile = composed;
    }

    if (parseInt(captchaInput, 10) !== captcha.answer) {
      toast({
        title: "Incorrect answer — please try again",
        variant: "destructive",
      });
      refreshCaptcha();
      return;
    }

    setSubmitting(true);

    try {
      const body: { name: string; email: string; mobile?: string } = {
        name: name.trim(),
        email: email.trim(),
      };
      if (mobile) body.mobile = mobile;

      const res = await fetch(`/api/events/${eventId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 409) {
        toast({
          title: "This event is now full",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: ["events"] });
        return;
      }

      if (!res.ok) throw new Error(`Status ${res.status}`);

      saveStoredUser({
        name: name.trim(),
        email: email.trim(),
        countryCode,
        nationalDigits,
      });

      queryClient.invalidateQueries({ queryKey: ["events"] });
      setSuccess(true);
      toast({ title: `Signed up for ${eventTitle}!` });
    } catch {
      toast({
        title: "Something went wrong",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-400" />
        <p className="font-display text-xl tracking-widest text-foreground">
          YOU'RE IN
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed up for {eventTitle}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative space-y-3">
      <input
        type="text"
        placeholder="YOUR NAME"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        className={fieldClassName}
      />
      <input
        type="email"
        placeholder="YOUR EMAIL"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        maxLength={255}
        className={fieldClassName}
      />

      <div className="space-y-2">
        <p className="font-body text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
          Country code
        </p>
        <Select value={countryCode} onValueChange={handleCountryChange}>
          <SelectTrigger aria-label="Country code" className={countrySelectTriggerClassName}>
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            sideOffset={6}
            align="start"
            className={countrySelectContentClassName}
          >
            {COUNTRY_DIAL_CODES.map((c) => (
              <SelectItem
                key={c.code}
                value={c.code}
                className={countrySelectItemClassName}
              >
                {c.name} (+{c.dial})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center border border-border bg-secondary px-4 py-3 focus-within:border-primary transition-colors">
          <span className="shrink-0 font-body text-sm tracking-widest text-muted-foreground">
            +{dialDigits}
          </span>
          <input
            type="tel"
            placeholder="Mobile (optional)"
            value={nationalDigits}
            onChange={(e) => handleNationalChange(e.target.value)}
            autoComplete="tel-national"
            inputMode="numeric"
            maxLength={nationalMax}
            aria-label="Mobile number, optional"
            className="ml-3 w-full min-w-0 bg-transparent font-body text-sm tracking-widest text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Honeypot */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="font-body text-sm tracking-widest text-muted-foreground whitespace-nowrap">
          {captcha.a} + {captcha.b} =
        </span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="?"
          value={captchaInput}
          onChange={(e) => setCaptchaInput(e.target.value)}
          maxLength={3}
          className={fieldClassName}
        />
        <button
          type="button"
          onClick={refreshCaptcha}
          className="shrink-0 border border-border px-3 py-3 font-body text-xs tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          aria-label="New question"
        >
          ↻
        </button>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-primary py-3 font-display text-sm tracking-widest text-primary-foreground transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "SIGNING UP…" : "CONFIRM SIGN UP"}
      </button>
    </form>
  );
}
