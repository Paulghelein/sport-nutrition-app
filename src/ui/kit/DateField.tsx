import { TextField } from './Fields'
import type { TextFieldProps } from './Fields'

/** Champ date natif (sélecteur iOS) : valeur `AAAA-MM-JJ`, `max` pour interdire le futur. */
export function DateField(props: Omit<TextFieldProps, 'type' | 'inputMode'>) {
  return <TextField {...props} type="date" />
}
