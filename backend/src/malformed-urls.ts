import type { NextFunction, Request, Response } from 'express';

/*
  Addresses that cannot have come from a visitor, turned away before anything
  tries to make sense of them.

  What arrives, from vulnerability scanners:

    /%252e%252e%252fetc%252fpasswd   decoded once:  /%2e%2e%2fetc%2fpasswd
                                     decoded twice: /../etc/passwd

  This is the classic double-encoding trick. It works wherever a filter
  inspects the address and a later stage decodes it again: the filter sees no
  dot and no slash, waves it through, and the stage after that uncovers the
  `../`. The defence is not to decode further until it looks clean — that is
  the bug, not the fix — but to refuse anything still encoded after one pass,
  which is what this does.

  Astro already refuses to route it, so nothing here changes what a request
  is answered with. What it changes is where the refusal happens.
  Left alone, the request travels the whole way to the renderer, which builds
  the shop's 404 page — 9 KB of catalogue markup for a bot that reads none of
  it — and writes a line to the error log on the way. One scanner sweep puts
  dozens of red lines in a log that ought to be worth reading.

  404 rather than 400 or 403, following IIS (404.11 for a double escape) and
  Apache (404 for an encoded slash under the default AllowEncodedSlashes).
  The address is well-formed as a URL — `%252e` is a perfectly legal way to
  write `%2e` — so 400 would be saying something untrue, and 403 would tell
  the scanner its probe was recognised, which is one bit more than it had.
  404 is what every other address the shop does not have already returns, and
  that sameness is the point.

  No body. A page here would only ever be rendered for software that discards
  it; the edge log already records the request and its status, so nothing is
  lost by this handler staying silent.
*/
function stillEncodedAfterOnePass(pathname: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURI(pathname);
  } catch {
    /*
      A stray `%` or a truncated sequence, such as /%zz or /abc%. Measured
      against production, nothing of this shape reaches the process: the edge
      in front answers it 400 over HTTP/1.1 and drops the stream over HTTP/2,
      and the error log bears that out — it only ever held the multi-level
      case above, never the invalid-encoding one. Kept because the rule is
      the same either way and an edge is not a thing to depend on: no address
      this shop issued can fail to decode, so there is nothing to look up.
    */
    return true;
  }
  // Both halves matter. An address with nothing to decode is ordinary, and so
  // is one that decodes cleanly — only one that decodes *into* more encoding
  // is making a second pass out of a first.
  return decoded !== pathname && /%[0-9a-fA-F]{2}/.test(decoded);
}

export function rejectMalformedUrls(req: Request, res: Response, next: NextFunction) {
  if (!stillEncodedAfterOnePass(req.path)) return next();
  res.status(404).end();
}
