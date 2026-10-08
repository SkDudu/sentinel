import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function EnvironmentSelect({
  environments,
  value,
  onChange,
  portalled,
}: {
  environments: Array<{ id: string; name: string }>;
  value: string | null;
  onChange: (id: string) => void;
  portalled?: boolean;
}) {
  const items = environments.map((env) => ({ value: env.id, label: env.name }));
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Ambiente" />
      </SelectTrigger>
      <SelectContent portalled={portalled}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
