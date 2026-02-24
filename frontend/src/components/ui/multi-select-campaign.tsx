"use client";

import * as React from "react";
import { Check, X, ChevronsUpDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

export type CampaignOption = {
  name: string;
  date: string;
  month: string;
};

interface MultiSelectCampaignProps {
  options: CampaignOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  placeholder?: string;
}

export function MultiSelectCampaign({
  options,
  selected,
  onChange,
  className,
  placeholder = "Selecione as campanhas...",
}: MultiSelectCampaignProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  const handleUnselect = (item: string) => {
    onChange(selected.filter((i) => i !== item));
  };

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      handleUnselect(value);
    } else {
      onChange([...selected, value]);
    }
    setInputValue(""); // Limpar input após seleção
    // Não fecha o popover para permitir seleção múltipla
  };

  // Filtragem personalizada para buscar por nome, data ou mês
  const filterFunction = (value: string, search: string) => {
    if (value === "selecionar todas") return 1; // Sempre exibir "Selecionar Todas"
    const option = options.find((opt) => opt.name === value);
    if (!option) {
      // Se não encontrar na lista (caso de item customizado já selecionado), compara apenas o valor
      return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
    }
    const searchLower = search.toLowerCase();
    if (
      option.name.toLowerCase().includes(searchLower) ||
      option.date.toLowerCase().includes(searchLower) ||
      option.month.toLowerCase().includes(searchLower)
    ) {
      return 1;
    }
    return 0;
  };

  const isAllSelected = options.length > 0 && options.every((opt) => selected.includes(opt.name));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(options.map((opt) => opt.name));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between h-auto min-h-[2.5rem] min-w-0", className)}
        >
          <div className="flex gap-1 flex-wrap min-w-0 flex-1">
            {selected.length === 0 && <span className="text-muted-foreground font-normal">{placeholder}</span>}
            {selected.length === 1 && (
              <Badge
                variant="secondary"
                className="mr-1 mb-1 max-w-full truncate"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUnselect(selected[0]);
                }}
              >
                <span className="truncate">{selected[0]}</span>
                <X className="ml-1 h-3 w-3 text-muted-foreground hover:text-foreground shrink-0" />
              </Badge>
            )}
            {selected.length > 1 && (
              <Badge variant="secondary" className="mr-1 mb-1">
                {selected.length} selecionados
              </Badge>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={filterFunction}>
          <CommandInput
            placeholder="Buscar campanha por nome, data ou mês..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandEmpty>
            <div className="p-2 text-sm text-muted-foreground text-center">
              Nenhuma campanha encontrada.
              {inputValue && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full justify-start"
                  onClick={() => handleSelect(inputValue)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar "{inputValue}"
                </Button>
              )}
            </div>
          </CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            <CommandItem
              value="selecionar todas"
              onSelect={toggleSelectAll}
              className="border-b mb-1 font-medium"
            >
              <Check
                className={cn(
                  "mr-2 h-4 w-4",
                  isAllSelected ? "opacity-100" : "opacity-0"
                )}
              />
              Selecionar Todas
            </CommandItem>
            {options.map((option) => {
              const isSelected = selected.includes(option.name);
              return (
                <CommandItem
                  key={option.name}
                  value={option.name}
                  onSelect={() => {
                    // O currentValue vem do value prop, que é option.name
                    handleSelect(option.name);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{option.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.date} - {option.month}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
            {/* Se o input não estiver vazio e não corresponder a nenhuma opção EXATA, mostra a opção de criar
                 Note: O CommandEmpty já lida com o caso de zero matches. 
                 Mas se quisermos mostrar "Criar" mesmo quando há matches parciais, precisamos de lógica extra.
                 Por simplicidade e UX padrão, vamos deixar no CommandEmpty ou adicionar um item fixo se não existir na lista.
             */}
            {inputValue && !options.some(opt => opt.name === inputValue) && !selected.includes(inputValue) && (
              <CommandItem
                value={inputValue}
                onSelect={() => handleSelect(inputValue)}
                className="border-t mt-1"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar "{inputValue}"
              </CommandItem>
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
