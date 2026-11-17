// Entry script for the marketing site (index.html): remember which ad sent
// the visitor, and load the Reddit pixel so it can see the ad click.
import { captureAttribution } from '@/lib/attribution';
import { loadRedditPixel } from '@/lib/adConversions';

captureAttribution();
loadRedditPixel();
