This is the final piece of the puzzle: **Automated Maintenance**.

You are absolutely right to be concerned. If you run `docker system prune -a` blindly, you risk deleting an image that you *just* pulled but haven't started yet.

The professional way to handle this is using a **Cron Job** (a scheduled task) combined with a **Time Filter**.

We will tell the server: *"Every night at 3:00 AM, delete any Docker junk that is **older than 24 hours**."*

This is safe because it preserves your currently running apps and anything you deployed recently.

### Step 1: Open the Cron Editor

SSH into your server and run this command:

```bash
crontab -e

```

*(If it asks you to choose an editor, press `1` for Nano).*

### Step 2: Add the Cleaning Schedule

Scroll to the very bottom of the file and paste this exact line:

```bash
0 3 * * * /usr/bin/docker system prune -af --filter "until=24h" >> /var/log/docker-prune.log 2>&1

```

**Breakdown of the command:**

* `0 3 * * *`: Run at **03:00 AM** every day.
* `/usr/bin/docker`: The full path to the Docker command (safer for cron).
* `system prune -af`: Delete unused images, stopped containers, and networks (Forcefully/Automatically).
* `--filter "until=24h"`: **The Safety Net.** Only delete items created more than 24 hours ago.
* `>> /var/log/docker-prune.log`: Save the output to a log file so you can check what was deleted.

### Step 3: Save and Exit

* Press `Ctrl+O`, `Enter` (to Save).
* Press `Ctrl+X` (to Exit).

### Step 4: Verify It

To confirm your job is saved, run:

```bash
crontab -l

```

You should see your line at the bottom.

---

### ⚠️ Bonus: Add to Terraform (For Future Servers)

Since you are building an "Infrastructure as Code" setup, you should also add this to your `user_data` script in `terraform/main.tf` or your `script.sh`.

Add this block to the end of your bootstrap script. It programmatically creates the cron job so any *new* server has this protection automatically.

```bash
# ----------------------------------------------------------
# 9. AUTOMATED MAINTENANCE (Cron Job)
# ----------------------------------------------------------
echo ">>> [9/9] Setting up Daily Docker Prune..."

# Write the cron job to a temporary file
echo "0 3 * * * /usr/bin/docker system prune -af --filter 'until=24h' >> /var/log/docker-prune.log 2>&1" > /tmp/mycron

# Install the cron job
crontab /tmp/mycron
rm /tmp/mycron

echo "    ✔ Maintenance scheduled for 3:00 AM daily"

```

Now your server will self-clean every night forever! 🧹✨