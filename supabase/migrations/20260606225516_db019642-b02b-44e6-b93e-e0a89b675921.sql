
-- Place kind enum
CREATE TYPE public.place_kind AS ENUM ('distillery', 'store');

-- Places: curated distilleries and stores
CREATE TABLE public.places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.place_kind NOT NULL,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  region text,
  description text,
  website text,
  image_url text,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.places TO anon, authenticated;
GRANT ALL ON public.places TO service_role;

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Places are viewable by everyone"
  ON public.places FOR SELECT
  USING (true);

CREATE TRIGGER places_set_updated_at
  BEFORE UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Follows: user follows a place
CREATE TABLE public.place_follows (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, place_id)
);

GRANT SELECT, INSERT, DELETE ON public.place_follows TO authenticated;
GRANT ALL ON public.place_follows TO service_role;

ALTER TABLE public.place_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows are viewable by everyone"
  ON public.place_follows FOR SELECT
  USING (true);

CREATE POLICY "Users can follow as themselves"
  ON public.place_follows FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unfollow themselves"
  ON public.place_follows FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX place_follows_place_id_idx ON public.place_follows(place_id);

-- Seed curated distilleries
INSERT INTO public.places (kind, slug, name, region, description, website) VALUES
  ('distillery', 'buffalo-trace', 'Buffalo Trace Distillery', 'Frankfort, KY', 'Historic distillery and home of Buffalo Trace, Eagle Rare, and the Antique Collection.', 'https://www.buffalotracedistillery.com'),
  ('distillery', 'makers-mark', 'Maker''s Mark', 'Loretto, KY', 'Iconic wheated bourbon hand-dipped in red wax.', 'https://www.makersmark.com'),
  ('distillery', 'woodford-reserve', 'Woodford Reserve', 'Versailles, KY', 'Small-batch bourbon distilled in copper pot stills.', 'https://www.woodfordreserve.com'),
  ('distillery', 'wild-turkey', 'Wild Turkey', 'Lawrenceburg, KY', 'Home of Russell''s Reserve and Rare Breed.', 'https://wildturkeybourbon.com'),
  ('distillery', 'four-roses', 'Four Roses', 'Lawrenceburg, KY', 'Known for ten distinct bourbon recipes.', 'https://fourrosesbourbon.com'),
  ('distillery', 'heaven-hill', 'Heaven Hill', 'Bardstown, KY', 'Producers of Elijah Craig, Henry McKenna, and Larceny.', 'https://heavenhilldistillery.com'),
  ('distillery', 'jim-beam', 'Jim Beam', 'Clermont, KY', 'World''s best-selling bourbon, seven generations of distilling.', 'https://www.jimbeam.com'),
  ('distillery', 'willett', 'Willett Distillery', 'Bardstown, KY', 'Family-owned distillery famous for Willett Pot Still Reserve.', 'https://kentuckybourbonwhiskey.com'),
  ('distillery', 'old-forester', 'Old Forester', 'Louisville, KY', 'America''s first bottled bourbon, since 1870.', 'https://www.oldforester.com'),
  ('distillery', 'michters', 'Michter''s', 'Louisville, KY', 'Small-batch American whiskey with deep historical roots.', 'https://michters.com');

-- Seed curated stores
INSERT INTO public.places (kind, slug, name, region, description, website) VALUES
  ('store', 'total-wine', 'Total Wine & More', 'National', 'America''s largest independent retailer of fine wine and spirits.', 'https://www.totalwine.com'),
  ('store', 'binnys', 'Binny''s Beverage Depot', 'Illinois', 'Chicago-area chain famous for single-barrel store picks.', 'https://www.binnys.com'),
  ('store', 'liquor-barn', 'Liquor Barn', 'Kentucky', 'Kentucky superstore with deep allocated bourbon selection.', 'https://www.liquorbarn.com'),
  ('store', 'westside-liquor', 'Westside Liquor', 'Minnesota', 'Minnesota chain known for bourbon barrel picks and releases.', 'https://www.westsideliquor.com'),
  ('store', 'seelbachs', 'Seelbach''s', 'Online', 'Online retailer specializing in craft and allocated bourbon.', 'https://seelbachs.com'),
  ('store', 'caskers', 'Caskers', 'Online', 'Online spirits retailer with rare and limited bourbon drops.', 'https://www.caskers.com');
