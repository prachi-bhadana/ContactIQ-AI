from sqlalchemy import Column,Integer,String
from database import Base


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String)
    first_name = Column(String)
    last_name = Column(String)

    email = Column(String)
    alternate_email = Column(String)

    phone = Column(String)
    alternate_phone = Column(String)

    organization = Column(String)

    designation = Column(String)
    experience_years = Column(String)
    experience_months = Column(String)
    industry = Column(String)
    city = Column(String)
    state = Column(String)
    country = Column(String)
    nationality = Column(String)
    linkedin = Column(String)
    website = Column(String)
    skills = Column(String)
    notes = Column(String)
    confidence = Column(Integer)
    

current_address = Column(String)
permanent_address = Column(String)

gender = Column(String)
marital_status = Column(String)
date_of_birth = Column(String)
language = Column(String)
religion = Column(String)
education = Column(String)

pan = Column(String)
aadhaar = Column(String)

occupation = Column(String)

primary_expertise = Column(String)
alternate_expertise = Column(String)

facebook = Column(String)
instagram = Column(String)
twitter = Column(String)
youtube = Column(String)

processing_status = Column(String)