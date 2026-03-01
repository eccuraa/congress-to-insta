import functions_framework
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.image as mpimg
import urllib.request
import base64, requests, io, os

BACKGROUND_IMAGE_URL = "https://i.ibb.co/xKVrkLfB/higher-res-base-plot.png"
IMGBB_API_KEY = "b3f8a3cee0c51f30cb26ac67f1b75f9e"

# === Wedge config (unchanged from your notebook) ===
house_dem_fixed_theta = 182
house_dem_max_sweep = 83
house_rep_fixed_theta = 353
house_rep_max_sweep = -85
senate_rep_fixed_theta = 0
senate_rep_max_sweep = 88
senate_ind_fixed_theta = 94
senate_ind_max_sweep = 8
senate_dem_fixed_theta = 179
senate_dem_max_sweep = -78



def add_wedge_to_image(ax, img_shape, center_x_ratio, center_y_ratio, radius_ratio, theta1, theta2, width_px, color, alpha):
    center_x = img_shape[1] / center_x_ratio
    center_y = img_shape[0] / center_y_ratio
    radius = min(img_shape[0], img_shape[1]) / radius_ratio
    wedge = patches.Wedge((center_x, center_y), radius, theta1, theta2, width=width_px, color=color, alpha=alpha)
    ax.add_patch(wedge)


def upload_to_imgbb(buf):
    encoded = base64.b64encode(buf.read()).decode("utf-8")
    response = requests.post("https://api.imgbb.com/1/upload", data={
        "key": IMGBB_API_KEY,
        "image": encoded,
        "name": "vote_record_plot"
    })
    if response.status_code != 200 or not response.json()["success"]:
        raise Exception(f"ImgBB upload failed: {response.text}")
    return response.json()["data"]["url"]


@functions_framework.http
def generate_arc_image(request):
    data = request.get_json()

    house_dem_value  = float(data["house_dem_value"])
    house_rep_value  = float(data["house_rep_value"])
    senate_rep_value = float(data["senate_rep_value"])
    senate_ind_value = float(data["senate_ind_value"])
    senate_dem_value = float(data["senate_dem_value"])

    house_dem_sweep  = house_dem_value  * house_dem_max_sweep
    house_rep_sweep  = house_rep_value  * house_rep_max_sweep
    senate_rep_sweep = senate_rep_value * senate_rep_max_sweep
    senate_ind_sweep = senate_ind_value * senate_ind_max_sweep
    senate_dem_sweep = senate_dem_value * senate_dem_max_sweep

    # Load background image from public URL
    urllib.request.urlretrieve(BACKGROUND_IMAGE_URL, "/tmp/bg.png")
    img = mpimg.imread("/tmp/bg.png")

    fig, ax = plt.subplots(1)
    ax.imshow(img)

    add_wedge_to_image(ax, img.shape, 2,    2,    2.5, house_dem_fixed_theta,                      house_dem_fixed_theta + house_dem_sweep,   246, 'blue', 0.6)
    add_wedge_to_image(ax, img.shape, 1.98, 1.92, 2.4, house_rep_fixed_theta + house_rep_sweep,    house_rep_fixed_theta,                     240, 'red',  0.6)
    add_wedge_to_image(ax, img.shape, 2,    2.05, 2.4, senate_rep_fixed_theta,                     senate_rep_fixed_theta + senate_rep_sweep, 242, 'red',  0.6)
    add_wedge_to_image(ax, img.shape, 1.95, 2.02, 2.4, senate_ind_fixed_theta,                     senate_ind_fixed_theta + senate_ind_sweep, 260, 'gray', 0.6)
    add_wedge_to_image(ax, img.shape, 2.02, 2.05, 2.5, senate_dem_fixed_theta + senate_dem_sweep,  senate_dem_fixed_theta,                    245, 'blue', 0.6)

    ax.axis('off')
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=400, bbox_inches='tight', pad_inches=0, transparent=True)
    plt.close(fig)
    buf.seek(0)

    image_url = upload_to_imgbb(buf)
    return {"imageUrl": image_url}, 200