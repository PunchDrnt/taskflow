'use client'

import { useState } from 'react'

import { Calendar } from '@repo/ui/components/calendar'
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@repo/ui/components/input-group'
import { RadioGroup, RadioGroupItem } from '@repo/ui/components/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/select'
import { Slider } from '@repo/ui/components/slider'
import { Switch } from '@repo/ui/components/switch'
import { Textarea } from '@repo/ui/components/textarea'

import { colors, Example } from '../_lib/shared'

export default function FormsPage() {
  const [date, setDate] = useState<Date | undefined>(new Date())

  return (
    <div className="grid grid-cols-1 gap-8 py-8 md:grid-cols-2">
      <Example title="Input" description="Single-line text field.">
        <Field>
          <FieldLabel htmlFor="ds-input">Email</FieldLabel>
          <Input id="ds-input" placeholder="you@example.com" />
          <FieldDescription>
            We&apos;ll never share your email.
          </FieldDescription>
        </Field>
      </Example>

      <Example
        title="Input (error)"
        description="Invalid state with a message."
      >
        <Field data-invalid="true">
          <FieldLabel htmlFor="ds-input-error">Email</FieldLabel>
          <Input
            id="ds-input-error"
            color="error"
            aria-invalid
            defaultValue="not-an-email"
          />
          <FieldError>Enter a valid email address.</FieldError>
        </Field>
      </Example>

      <Example title="Input group" description="Input with an addon.">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>https://</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput placeholder="example.com" />
        </InputGroup>
      </Example>

      <Example title="Textarea" description="Multi-line text field.">
        <Field>
          <FieldLabel htmlFor="ds-textarea">Description</FieldLabel>
          <Textarea id="ds-textarea" placeholder="Add a description…" />
        </Field>
      </Example>

      <Example title="Select" description="Choose one from a closed list.">
        <Field>
          <FieldLabel htmlFor="ds-select">Framework</FieldLabel>
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
      </Example>

      <Example title="Combobox" description="Searchable single-select.">
        <Field>
          <FieldLabel htmlFor="ds-combobox">Framework</FieldLabel>
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
      </Example>

      <Example
        title="Checkbox"
        description="Boolean toggle, per semantic color."
      >
        <div className="flex flex-wrap items-center gap-4">
          {colors
            .filter((c) => c !== 'neutral' && c !== 'tertiary')
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
      </Example>

      <Example title="Switch" description="Boolean toggle, per semantic color.">
        <div className="flex flex-wrap items-center gap-4">
          {colors
            .filter((c) => c !== 'neutral' && c !== 'tertiary')
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
      </Example>

      <Example title="Radio group" description="Choose exactly one option.">
        <RadioGroup defaultValue="primary" className="flex flex-row gap-4">
          {(['primary', 'error', 'success'] as const).map((color) => (
            <label key={color} className="text-body-md flex items-center gap-2">
              <RadioGroupItem value={color} color={color} />
              {color}
            </label>
          ))}
        </RadioGroup>
      </Example>

      <Example title="Slider" description="Pick a value along a range.">
        <Slider defaultValue={[40]} className="w-full max-w-xs" />
      </Example>

      <Example
        title="Calendar"
        description="Date picker, single-select mode."
        className="md:col-span-2"
      >
        <Calendar
          mode="single"
          selected={date}
          onSelect={setDate}
          className="rounded-lg border"
        />
      </Example>
    </div>
  )
}
