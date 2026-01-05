# Proofreader for Obsidian
![Obsidian downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22proofreader%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&style=plastic)
![GitHub download count](https://img.shields.io/github/downloads/chrisgrieser/obsidian-proofreader/total?label=GitHub%20Downloads&style=plastic)
![Last release](https://img.shields.io/github/v/release/chrisgrieser/obsidian-proofreader?label=Latest%20Release&style=plastic)

AI-based proofreading and stylistic improvements for your writing. Changes are
inserted as suggestions directly in the editor, similar to the suggested changes
feature in word processing apps.

<img alt="Showcase" width=70% src="https://github.com/user-attachments/assets/fa77eb97-61b9-4102-b8b2-e7c385868363">

## Table of contents

<!-- toc -->

- [Features](#features)
- [Installation & setup](#installation--setup)
    - [Plugin installation](#plugin-installation)
    - [Get an OpenAI API key](#get-an-openai-api-key)
- [Usage](#usage)
- [Visual appearance of the changes](#visual-appearance-of-the-changes)
- [Testimonials](#testimonials)
- [Plugin development](#plugin-development)
    - [General](#general)
    - [Adding support for new LLMs](#adding-support-for-new-llms)
- [About the developer](#about-the-developer)

<!-- tocstop -->

## Features
- Suggested changes are inserted directly into the text: Additions as
  `==highlights==` and removals as `~~strikethroughs~~`.
- Accept or reject changes with just one hotkey.
- Easy to use: No complicated plugin settings and AI parameters to configure.

|                                       | Professional proofreading service               | Proofreader plugin                                                           |
| ------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Cost for English text of 10,000 words | ~ $400, depending on the service                | ~ \$0.01 – $0.06[^1]                                                         |
| Completion duration                   | up to 3 work days                               | about 5 minutes                                                              |
| Input format                          | usually Microsoft Word (`.docx`)                | Markdown file in Obsidian                                                    |
| Method of incorporating changes       | mostly mouse clicks                             | keyboard shortcuts                                                           |
| Additional benefits                   | Editor makes general comments on writing style. | Plugin can also be used to quickly proofread single sentences or paragraphs. |

[^1]: Estimated pricing for the [GPT 4.1 nano
    model](https://platform.openai.com/docs/models/) in April 2025. The plugin
    developer is not responsible if the actual costs differ. You can track your
    usage costs [on this page](https://platform.openai.com/usage).

> [!NOTE]
> This plugin requires an **OpenAI API key** and incurs costs at OpenAI based on
> usage. Network requests are made when running the proofreading command. (PRs
> [adding support for other LLMs](#adding-support-for-new-llms) are welcome.)

## Installation & setup

### Plugin installation
[Install in Obsidian](https://obsidian.md/plugins?id=proofreader)

### Get an OpenAI API key
1. [Create an OpenAI account](https://auth.openai.com/create-account).
2. Go to [this site](https://platform.openai.com/api-keys), and click `Create
   new secret key`.
3. Copy the API key.
4. In Obsidian, go to `Settings → Proofreader` and paste your API key there.

> [!TIP]
> The usage costs should not be very high, nonetheless you can track them
> [on this page](https://platform.openai.com/usage).

## Usage
1. Use the command `Proofread selection/paragraph` to check the selected
   text. If there is no selection, the command will check the current paragraph.
   Alternatively, you can also check the whole document with `Proofread full
   document`. However, note that the quality of AI suggestions tends to decrease
   when proofreading too much text at once.
2. The changes are automatically inserted.
3. Accept/reject changes with `Accept suggestions in selection/paragraph` and
   `Reject suggestions in selection/paragraph`. Same as the proofreading
   command, the `accept` and `reject` commands affect the current paragraph if
   there is no selection. Alternatively, you can also only accept/reject the
   next suggestion after your cursor via `Accept next suggestion` and `Reject
   next suggestion`.

## Visual appearance of the changes
You can add the following CSS snippet to make highlights and strikethroughs
appear like suggested changes, similar to the screenshot further above.
([Manual: How to add CSS snippets.](https://help.obsidian.md/snippets))

```css
.cm-strikethrough {
	text-decoration-color: var(--color-red);
}

.cm-s-obsidian span.cm-highlight {
	background-color: rgba(var(--color-green-rgb), 35%);
}
```

## Testimonials

> I was paying $29 a month for `type.ai` until today, your plugin made me cancel
> the subscription, because the only feature I wanted from there was this inline
> granular diffing which no other app offered, until Proofreader.
> [@samwega](https://github.com/chrisgrieser/obsidian-proofreader/discussions/1#discussioncomment-12972780)

## Plugin development

### General

```bash
just init   # run once after cloning

just format # run all formatters
just build  # builds the plugin
just check  # runs the pre-commit hook (without committing)
```

> [!NOTE]
> This repo uses a pre-commit hook, which prevents commits that do not build or
> do not pass the checks.

### Adding support for new LLMs
1. Create a new adapter for the LLM in
   [./src/providers/](./src/providers/). This should take ~50 lines of code.
2. In [./src/providers/model-info.ts](./src/providers/model-info.ts), add the
   adapter function to `PROVIDER_ADAPTER_MAP`, and add models for the new
   provider to `MODEL_SPECS`.
3. In [./src/settings.ts](./src/settings.ts), add a setting for the API key to
   `ProofreaderSettingsMenu` and add a field to `DEFAULT_SETTINGS`.

## About the developer
In my day job, I am a sociologist studying the social mechanisms underlying the
digital economy. For my PhD project, I investigate the governance of the app
economy and how software ecosystems manage the tension between innovation and
compatibility. If you are interested in this subject, feel free to get in touch.

- [Website](https://chris-grieser.de/)
- [ResearchGate](https://www.researchgate.net/profile/Christopher-Grieser)
- [Mastodon](https://pkm.social/@pseudometa)
- [LinkedIn](https://www.linkedin.com/in/christopher-grieser-ba693b17a/)

<a href='https://ko-fi.com/Y8Y86SQ91' target='_blank'> <img height='36'
style='border:0px;height:36px;' src='https://cdn.ko-fi.com/cdn/kofi1.png?v=3'
border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
