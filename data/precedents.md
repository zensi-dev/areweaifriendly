# Classifier precedents

Rulings maintainers made while reviewing the classifier's answers. Every line starting with `- ` is
added to the classifier's instructions (`scripts/lib/classify.ts`), so it applies to the weekly check
and to new submissions. When a review corrects the classifier, add one line: the wording pattern,
the ruling, and the project it came from. Keep each line general enough to apply to other projects.

- Forbidden by default, allowed only with case-by-case approval ("presumed to be tainted code, and must not be committed without prior written approval by core"): the code uses are not-allowed and the exception is an other rule. (NetBSD, 2026-10-25)
- "Discuss significant changes with us first" is a prior-approval condition on the permitted uses, not a scope-limit. (Docusaurus, 2026-10-25)
- One part of the project bans AI while the rest permits it (Budgie 11 AI-free, Budgie 10 and the website not): the code uses keep the permitted status with a required scope-limit naming where AI is allowed, and the ban on the other part is an other rule. (Budgie, 2026-10-25)
- "AI-generated pull requests for good first issues will be closed": required scope-limit on the code uses, detail "not for good first issues". (Matplotlib, 2026-11-09)
- "No AI bots or agents may open pull requests, create issues or comment": agent-contributions, agent-issues and agent-comments are each not-allowed, even when nothing else is said about issues or comments. (Matplotlib, 2026-10-25)
- "LLM translation is discouraged" or "we prefer you do not use machine translation": discouraged, not not-allowed. (NLnet Labs, 2026-10-25)
- "All text you submit must be in your own words": not-allowed for every text use it covers (issue-writing, pr-description, commit-message, comments, posts, docs-writing), while research stays allowed if stated. (Mesa, 2026-10-25)
- "Do not use AI for writing pull request descriptions, or commenting on issues or PRs": pr-description and comments are not-allowed; issue-writing gets no rule unless issue reports are named. (scikit-image, 2026-11-09)
- "If you quote AI text, do so sparingly and mark it": quoting-ai conditional with mark-quotes and size-limit required. (scikit-image, 2026-11-09)
