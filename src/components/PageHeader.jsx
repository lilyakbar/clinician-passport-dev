import React from "react";

export default function PageHeader({ title, description, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 className="text-[30px] sm:text-[34px] font-heading font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-[14px] text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}