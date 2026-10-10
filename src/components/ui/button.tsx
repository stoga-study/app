import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// Tactile pill buttons (Brand Guidelines p. 11): 52px tall, hard bottom edge, drop 2px on press.
const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn-primary",
      secondary: "btn-secondary",
      inverse: "btn-inverse",
      ghost: "btn-ghost",
    },
    size: { default: "", sm: "btn-sm" },
    block: { true: "btn-block", false: "" },
  },
  defaultVariants: { variant: "primary", size: "default", block: false },
});

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, block, asChild, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
