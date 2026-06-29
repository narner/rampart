# Rampart whitepaper — Markdown -> LaTeX -> PDF.
#
# Builds WHITEPAPER.md into a formatted whitepaper PDF with a title block
# (authorship), table of contents, and a references section driven by
# references.bib. Metadata (title, author, date, abstract, bibliography
# settings) lives in metadata.yaml so the source Markdown stays clean for
# GitHub rendering.

SRC  := ../WHITEPAPER.md
META := metadata.yaml
BIB  := references.bib
TEX  := whitepaper.tex
PDF  := whitepaper.pdf
BODY := .body.md

PANDOC_FLAGS := --standalone \
	--citeproc \
	--metadata-file=$(META) \
	--bibliography=$(BIB) \
	--top-level-division=section \
	--pdf-engine=xelatex

.PHONY: tex pdf watch open clean

# Strip the leading H1 (title comes from metadata.yaml) and the body
# "## Abstract" section (abstract comes from metadata.yaml), so neither is
# duplicated in the rendered PDF. Everything from "## 1." onward is kept.
$(BODY): $(SRC)
	@awk 'NR==1 && /^# / {next} \
		/^## Abstract$$/ {skip=1; next} \
		skip && /^## / {skip=0} \
		!skip {print}' $(SRC) > $(BODY)

tex: $(BODY) $(META) $(BIB)
	pandoc $(BODY) -o $(TEX) $(PANDOC_FLAGS)

pdf: $(BODY) $(META) $(BIB)
	pandoc $(BODY) -o $(PDF) $(PANDOC_FLAGS)

open: pdf
	open -a "Google Chrome" $(PDF)

# Hot reload: rebuild the PDF on every save of the source. Chrome
# auto-reloads the PDF when the file changes.
watch:
	@command -v fswatch >/dev/null || { echo "install fswatch: brew install fswatch"; exit 1; }
	@$(MAKE) pdf
	@open -a "Google Chrome" $(PDF)
	@echo "watching $(SRC)..."
	@fswatch -o $(SRC) $(META) $(BIB) | while read _; do $(MAKE) pdf; done

clean:
	rm -f $(BODY) $(TEX) $(PDF) \
		*.aux *.fdb_latexmk *.fls *.log *.out *.toc *.synctex.gz *.xdv
