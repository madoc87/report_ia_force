"use client";

import * as React from "react";
import { Check, X, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export type Tag = {
  id: string;
  name: string;
  color: string;
};

interface MultiSelectComboboxProps {
  options: Tag[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  placeholder?: string;
}

export function MultiSelectCombobox({
  options,
  selected,
  onChange,
  className,
  placeholder = "Selecione as etiquetas...",
}: MultiSelectComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const handleUnselect = (item: string) => {
    onChange(selected.filter((i) => i !== item));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          style={{ height: 'auto', minHeight: '2.5rem' }}
        >
          <div className="flex gap-1 flex-wrap">
            {selected.length === 0 && placeholder}
            {selected.map((item) => {
              const tag = options.find((opt) => opt.id === item);
              if (!tag) return null;
              return (
                <Badge
                  variant="secondary"
                  key={item}
                  className="mr-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnselect(item);
                  }}
                >
                  <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: tag.color }}></div>
                  {tag.name}
                  <X className="ml-1 h-4 w-4" />
                </Badge>
              );
            })}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Buscar etiqueta..." />
          <CommandEmpty>Nenhuma etiqueta encontrada.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {options.map((option) => {
              const isSelected = selected.includes(option.id);
              return (
                <CommandItem
                  key={option.id}
                  value={option.name} // O valor usado para a busca interna do CMDK
                  onSelect={() => {
                    if (isSelected) {
                      handleUnselect(option.id);
                    } else {
                      onChange([...selected, option.id]);
                    }
                    setOpen(true); // Manter o popover aberto
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: option.color }}></div>
                  {option.name}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
