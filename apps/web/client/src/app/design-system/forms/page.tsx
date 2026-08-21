'use client'

import { Checkbox } from '@repo/ui/components/checkbox'
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@repo/ui/components/combobox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@repo/ui/components/field'
import { Input } from '@repo/ui/components/input'
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import { Switch } from '@repo/ui/components/switch'

import { colors } from '../_lib/shared'

export default function FormsPage() {
  return (
    <div className="grid grid-cols-1 gap-8 py-8 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="ds-input">Input</FieldLabel>
        <Input id="ds-input" placeholder="you@example.com" />
        <FieldDescription>We&apos;ll never share your email.</FieldDescription>
      </Field>

      <Field data-invalid="true">
        <FieldLabel htmlFor="ds-input-error">Input (error)</FieldLabel>
        <Input
          id="ds-input-error"
          color="error"
          aria-invalid
          defaultValue="not-an-email"
        />
        <FieldError>Enter a valid email address.</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="ds-select">Select</FieldLabel>
        <Select defaultValue="next">
          <SelectTrigger id="ds-select" className="w-full">
            <SelectValue placeholder="Pick a framework" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="next">Next.js</SelectItem>
            <SelectItem value="remix">Remix</SelectItem>
            <SelectItem value="astro">Astro</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="ds-combobox">Combobox</FieldLabel>
        <Combobox
          items={[
            { value: 'next', label: 'Next.js' },
            { value: 'remix', label: 'Remix' },
            { value: 'astro', label: 'Astro' },
          ]}
        >
          <ComboboxInput id="ds-combobox" placeholder="Search framework..." />
          <ComboboxContent>
            <ComboboxEmpty>No results.</ComboboxEmpty>
            <ComboboxList>
              <ComboboxCollection>
                {(item: { value: string; label: string }) => (
                  <ComboboxItem key={item.value} value={item.value}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>

      <div className="flex flex-col gap-3">
        <span className="label-small text-text-secondary">Checkbox colors</span>
        <div className="flex flex-wrap items-center gap-4">
          {colors
            .filter((c) => c !== 'neutral')
            .map((color) => (
              <label
                key={color}
                className="text-body-md flex items-center gap-2"
              >
                <Checkbox color={color} defaultChecked />
                {color}
              </label>
            ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="label-small text-text-secondary">Switch colors</span>
        <div className="flex flex-wrap items-center gap-4">
          {colors
            .filter((c) => c !== 'neutral')
            .map((color) => (
              <label
                key={color}
                className="text-body-md flex items-center gap-2"
              >
                <Switch color={color} defaultChecked />
                {color}
              </label>
            ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 md:col-span-2">
        <span className="label-small text-text-secondary">Radio group</span>
        <RadioGroup defaultValue="primary" className="flex flex-row gap-4">
          {(['primary', 'error', 'success'] as const).map((color) => (
            <label key={color} className="text-body-md flex items-center gap-2">
              <RadioGroupItem value={color} color={color} />
              {color}
            </label>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}
