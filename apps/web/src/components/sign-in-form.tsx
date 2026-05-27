import { Button } from "@caretalk/ui/components/button";
import { Card, CardContent } from "@caretalk/ui/components/card";
import { Input } from "@caretalk/ui/components/input";
import { Label } from "@caretalk/ui/components/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { DisplayHero, Eyebrow, LimeKeyword, StarfieldCanvas } from "@/components/brand";
import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const navigate = useNavigate({ from: "/" });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess: () => {
            navigate({ to: "/" });
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  if (isPending) return <Loader />;

  return (
    <StarfieldCanvas className="flex items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1fr_420px]">
        <div className="hidden space-y-4 lg:block">
          <Eyebrow>Health memory workspace</Eyebrow>
          <DisplayHero>
            Curated health <LimeKeyword>memory</LimeKeyword>
          </DisplayHero>
          <p className="type-body-lg max-w-md text-muted-foreground">
            Temporary chats stay separate from what gets saved to your workspace. Review before anything becomes permanent.
          </p>
        </div>

        <Card variant="light">
          <CardContent className="space-y-6 pt-8">
            <div className="space-y-1 text-center lg:text-left">
              <Eyebrow className="text-sentri-violet-mid">Sign in</Eyebrow>
              <h2 className="font-display text-2xl font-semibold text-card-foreground">Welcome back</h2>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>
                      Email
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {field.state.meta.errors.map((error) => (
                      <p key={error?.message} className="text-sm text-destructive">
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </form.Field>

              <form.Field name="password">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>
                      Password
                    </Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {field.state.meta.errors.map((error) => (
                      <p key={error?.message} className="text-sm text-destructive">
                        {error?.message}
                      </p>
                    ))}
                  </div>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
                {({ canSubmit, isSubmitting }) => (
                  <Button className="w-full glow-cta-dark" disabled={!canSubmit || isSubmitting} type="submit">
                    {isSubmitting ? "Signing in…" : "Sign in"}
                  </Button>
                )}
              </form.Subscribe>
            </form>

            <div className="text-center">
              <Button onClick={onSwitchToSignUp} type="button" variant="link">
                Need an account? <LimeKeyword className="ml-1 text-sm">Sign up</LimeKeyword>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </StarfieldCanvas>
  );
}
