import sys
sys.path.insert(0, ".")
import chars_a, chars_b
want = sys.argv[1:]
for f in (chars_a.lena, chars_a.bjorn, chars_a.zaw, chars_a.yuelan, chars_b.mariel, chars_b.adrien, chars_b.ravi, chars_b.gensai):
    if not want or f.__name__ in want:
        f()
