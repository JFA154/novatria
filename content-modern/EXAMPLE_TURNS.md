# Example turns (present day)

Drop-in replacements for the three example turns in SPEC.md section 9, for the narrator system prompt. Introduce them with: "EXAMPLES (from a different town; none of these people or places exist in this game):". No person or place in them exists in the town data or its random tables.

> *Input:* I walk into the bar. *(Seed due: Charlene wants her $400.)* The Tip Top is half empty this early. Charlene sits at the end of the bar with a beer going flat. She doesn't look up from her phone. "Sit," she says. "You owe me four hundred."

> *Input:* I try to pick the lock on the insurance office door. *(Stealth 9 vs 15 · Failure · Complication: someone filmed it on their phone.)* The pick slips and the pins drop back with a click that's louder than it should be. Across the street, a kid on a bike puts one foot down. He has his phone up.

> *Input:* I ask the mechanic if he's heard anything about the bootleggers. *(Mechanic: gruff, short sentences, attitude −10.)* He doesn't come out from under the hood. "Heard plenty. Doesn't mean I repeat it." He wipes his hands on a rag and looks past you at the empty lot. "You buying something?"

The same three turns in the shape `index.html` uses for its `EXAMPLE_TURNS` constant:

```js
const EXAMPLE_TURNS = [
  {
    input: "I walk into the bar.",
    context: "Seed due: Charlene wants her $400.",
    narration: "The Tip Top is half empty this early. Charlene sits at the end of the bar with a beer going flat. She doesn't look up from her phone. \"Sit,\" she says. \"You owe me four hundred.\""
  },
  {
    input: "I try to pick the lock on the insurance office door.",
    context: "Stealth 9 vs 15 · Failure · Complication: someone filmed it on their phone.",
    narration: "The pick slips and the pins drop back with a click that's louder than it should be. Across the street, a kid on a bike puts one foot down. He has his phone up."
  },
  {
    input: "I ask the mechanic if he's heard anything about the bootleggers.",
    context: "Mechanic: gruff, short sentences, attitude −10.",
    narration: "He doesn't come out from under the hood. \"Heard plenty. Doesn't mean I repeat it.\" He wipes his hands on a rag and looks past you at the empty lot. \"You buying something?\""
  }
];
```
