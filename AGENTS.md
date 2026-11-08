# Instructions for coding agents

When the user asks for a UML diagram of code, write a `diagram.json`, validate it, then deliver one HTML file.

## Loop

1. Read the code you are diagramming. Diagram only what exists.
2. Write `.uml/<name>/diagram.json` (see the formats in `README.md`).
3. Run `node bin/uml.mjs validate .uml/<name>/diagram.json`.
4. If it prints errors, fix exactly what each one names and validate again. Do not guess around a code.
5. Run `node bin/uml.mjs deliver .uml/<name>/diagram.json --open`.
6. Tell the user where the `.html` file is. Do not paste the JSON back.

## Choosing the diagram type

- **`"type": "usecase"`** for features and who uses them: actors, use cases, `include`, `extend`.
- **class** (omit `type`) for code structure: classes, interfaces, inheritance, composition.

## Rules

- No coordinates. Layout is automatic.
- `id` values use letters, digits and underscores and start with a letter. Put readable names in `label`.
- Use-case `associates` goes from an actor to a use case. `include` and `extend` connect two use cases. `generalizes` connects two actors or two use cases.
- Put external systems on `"side": "right"`.
- For a large codebase, add `views` so each tab stays readable (about 8 to 12 nodes).
- Keep member strings in the form `"+ name(args): Type"` for classes.
