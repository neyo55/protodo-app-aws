This is fantastic progress. Your dashboard looks professional.

**⚠️ CRITICAL WARNING:** Look at your dashboard screenshot (`Todo-prometheus.JPG`).

* **Root FS Used: 91.7%** (Red Gauge).
* **RAM Used: 77.9%** (Green Gauge).

**You are in the Danger Zone.** Your disk is almost full. This happens because Docker images and logs accumulate quickly on small servers. If it hits 100%, the server will crash.

* **Immediate Action:** SSH into your server and run `sudo docker system prune -a -f` to clear unused images and build cache.

Now, let's solve your requests to visualize API data and set up alerts.

---

### 1. How to Check API Traffic (Flask Metrics) 📉

You already instrumented your code with `prometheus-flask-exporter`. Now you just need a dashboard to visualize it.

1. **Open Grafana:** `http://localhost:3000` (Make sure your SSH tunnel is running).
2. **Import Dashboard:**
* Go to **Dashboards** (left menu) > **New** > **Import**.
* Enter Dashboard ID: **`9688`** (This is a standard dashboard for the library we used).
* Click **Load**.


3. **Configure:**
* **Data Source:** Select `Prometheus`.
* Click **Import**.



**What you will see:**

* **Requests per second:** How busy your API is.
* **Latency:** How long (in milliseconds) your API takes to respond.
* **Status Codes:** Are users getting `200 OK` or `500 Error`?

---

### 2. How to Configure Alerting (Resource > 50%) 🚨

Grafana has a built-in "Unified Alerting" system. We will set it up to email you when things go wrong.

#### Step A: Set up the "Contact Point" (Email)

1. In Grafana, go to **Alerting** (Bell icon) > **Contact points**.
2. Click **+ Add contact point**.
3. **Name:** `DevOps-Email`.
4. **Integration:** `Email`.
5. **Addresses:** Enter your email address.
6. Click **Save contact point**.
* *(Note: For this to work, Grafana needs SMTP settings in `docker-compose.yml`. Since we didn't add SMTP details to the Grafana container yet, it won't actually send emails. For now, we will set up the **Rules**, and I will give you the SMTP config at the end).*



#### Step B: Create the Alert Rules

Go to **Alerting** > **Alert rules** > **+ New alert rule**.

We will create one rule for **Disk Usage** as an example. You can repeat this process for RAM and CPU.

**1. Define Query**

* **Rule name:** `High Disk Usage (>50%)`.
* Select **Prometheus** as the data source.
* **Query A:** Enter this PromQL code:
```promql
100 - ((node_filesystem_avail_bytes{mountpoint="/"} * 100) / node_filesystem_size_bytes{mountpoint="/"})

```


*(This calculates the "Used Percentage").*
* Click **Run query** to test. (You will see it says 91% right now).

**2. Define Condition (The Threshold)**

* **Condition:** `B` (The result of the query).
* **Operation:** `Is above`.
* **Input:** `50`.

**3. Set Evaluation Behavior**

* **Folder:** Create a new folder named "Critical Infrastructure".
* **Group:** "Hardware Checks".
* **Evaluate every:** `1m` (Check every minute).
* **For:** `2m` (Wait for it to stay high for 2 minutes before screaming).

**4. Configure Notifications**

* **Contact point:** Select `DevOps-Email`.
* Click **Save rule and exit**.

---

#### Step C: Enable Email Sending (Update Docker Compose)

For Grafana to actually send those emails, it needs your Brevo (SMTP) credentials.

**Action:** Update the `grafana` service in your local `docker-compose.yml` to include these SMTP environment variables.

```yaml
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD
      # === NEW: EMAIL SETTINGS ===
      - GF_SMTP_ENABLED
      - GF_SMTP_HOST
      - GF_SMTP_USER
      - GF_SMTP_PASSWORD
      - GF_SMTP_FROM_ADDRESS
    volumes:
      - grafana_data:/var/lib/grafana
    restart: always

```

**Final Steps:**

1. **Push Changes:** `git add .`, `git commit -m "Enable Grafana Email"`, `git push`.
2. Wait for the deploy.
3. Once deployed, your Alert Rule (Disk > 50%) will immediately turn **Firing** (Red) because you are at 91%. You should receive an email shortly!


You are extremely close! The reason you are "stuck" is that Grafana separates the **Data** (your query) from the **Decision** (the threshold).

Right now, your Query A is successfully calculating the disk usage (I can see it's **81%** in the table preview). Now we need to add the "Judge" to say "If this number is above 50, scream."

### 🚨 **IMMEDIATE ACTION REQUIRED** 🚨

Before we fix the alert, look at your dashboard screenshot.

* **Root FS Used: 91.7%** (Red Gauge).
* **RAM Used: 77.9%** (Green Gauge).

**Your server is about to crash.** You have less than 10% disk space left.
Please open your terminal **right now** and run this command to free up space:

```bash
sudo docker system prune -a -f

```

*(This deletes unused images and build cache, which likely ate up your space).*

---

### 🟢 How to Fix Step 2: Define Condition (The Missing Box)

In your screenshot, you are looking at **Query A**. To set the "Greater Than 50%" rule, you need to add an **Expression**.

1. **Scroll Down:** Look immediately below the "Table" preview area (where you see the value 81.08375).
2. **Click "+ Add expression":** There should be a button labeled `+ Add expression` (or sometimes just `+ Expression`).
3. **Step A: Reduce the Data:**
* A new block (Block B) will appear.
* **Operation:** Select **Reduce**.
* **Function:** Select **Last**.
* **Input:** Select **A**.
* *Why? This turns the "stream" of data into a single "final number" that Grafana can check.*


4. **Step B: Add the Threshold:**
* Click `+ Add expression` again.
* A new block (Block C) will appear.
* **Operation:** Select **Threshold**.
* **Input:** Select **B**.
* **IS ABOVE:** Enter **50**.


5. **Step C: Set the Trigger:**
* Look at the header of your new **Block C**.
* Click the text/link that says **Set as alert condition**.
* *You will see a "bell" icon appear on Block C, meaning THIS is the rule that triggers the email.*



Once you do this, you can proceed to the bottom and click **Save rule and exit**.

**Summary of what your screen should look like:**

* **A:** The Query (Calculates 81%)
* **B:** Reduce (Grabs the number "81")
* **C:** Threshold (Checks: Is 81 > 50? **YES** -> **Fire Alert**) 🔔