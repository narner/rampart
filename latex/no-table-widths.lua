-- Size table columns proportionally to their content instead of using
-- pandoc's separator-dash-derived widths (which produce a near-zero first
-- column and overlapping text) or naive equal widths (which waste space on
-- short columns).
--
-- For each column we measure a "natural width": the longest word (so a column
-- never overflows mid-token) and the average cell length, blended. Columns are
-- then allocated proportionally to that natural width, with a minimum floor so
-- short label columns still fit their header. Widths always sum to 1.

local function cell_text(cell)
  return pandoc.utils.stringify(cell)
end

local function col_metrics(rows, ncols)
  local longest_word = {}
  local total_len = {}
  local count = {}
  for c = 1, ncols do
    longest_word[c] = 1
    total_len[c] = 0
    count[c] = 0
  end
  for _, row in ipairs(rows) do
    local c = 0
    for _, cell in ipairs(row.cells) do
      c = c + 1
      if c <= ncols then
        local txt = cell_text(cell)
        total_len[c] = total_len[c] + #txt
        count[c] = count[c] + 1
        for word in txt:gmatch("%S+") do
          if #word > longest_word[c] then longest_word[c] = #word end
        end
      end
    end
  end
  return longest_word, total_len, count
end

function Table(tbl)
  local ncols = #tbl.colspecs
  if ncols == 0 then return tbl end

  -- Gather every body row plus header rows.
  local rows = {}
  for _, r in ipairs(tbl.head.rows) do rows[#rows + 1] = r end
  for _, body in ipairs(tbl.bodies) do
    for _, r in ipairs(body.body) do rows[#rows + 1] = r end
  end

  local longest_word, total_len, count = col_metrics(rows, ncols)

  -- Natural width: blend average cell length with the longest single word,
  -- so a wordy prose column gets room but a column with one long token still
  -- reserves enough to avoid mid-word overflow.
  local natural = {}
  local sum = 0
  for c = 1, ncols do
    local avg = count[c] > 0 and (total_len[c] / count[c]) or 1
    natural[c] = math.max(avg, longest_word[c] * 0.9)
    sum = sum + natural[c]
  end

  -- Proportional allocation, but never narrower than the column's longest
  -- single token (estimated against a ~78-char reference line, padded 15% for
  -- inter-word/monospace slack) so labels like "Deterministic" never overflow.
  -- Re-normalize afterward so the widths still sum to 1.
  local widths = {}
  local total = 0
  for c = 1, ncols do
    local proportional = natural[c] / sum
    local token_min = (longest_word[c] * 1.15) / 78
    widths[c] = math.max(proportional, token_min)
    total = total + widths[c]
  end
  for c = 1, ncols do
    widths[c] = widths[c] / total
  end

  for c, spec in ipairs(tbl.colspecs) do
    spec[2] = widths[c]
  end
  return tbl
end
